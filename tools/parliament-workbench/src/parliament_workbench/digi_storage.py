from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .config import WorkbenchConfig


class DigiStorageUnavailable(RuntimeError):
    def __init__(self, message: str, status: str = "error"):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class DigiAuthState:
    token: str
    mount_id: str


def digi_config_status(config: WorkbenchConfig) -> dict[str, Any]:
    missing = []
    if not config.digi_storage_email:
        missing.append("DIGI_STORAGE_EMAIL")
    if not config.digi_storage_password:
        missing.append("DIGI_STORAGE_PASSWORD")
    return {
        "configured": len(missing) == 0,
        "missingEnv": missing,
        "baseUrl": config.digi_storage_base_url,
        "apiUrl": config.digi_storage_api_url,
        "basePath": f"/{config.digi_storage_base_path.strip('/')}",
        "mountIdConfigured": bool(config.digi_storage_mount_id),
    }


def digi_status(config: WorkbenchConfig) -> dict[str, Any]:
    status = digi_config_status(config)
    if not status["configured"]:
        return {**status, "authenticated": False, "mountFound": False, "lastError": "Digi Storage credentials are not configured."}
    try:
        auth = DigiStorageClient(config).authenticate()
        return {**status, "authenticated": True, "mountFound": True, "mountId": redacted_id(auth.mount_id)}
    except DigiStorageUnavailable as error:
        return {**status, "authenticated": error.status != "auth_failed", "mountFound": False, "lastError": str(error)}
    except Exception as error:
        return {**status, "authenticated": False, "mountFound": False, "lastError": str(error)}


def ftp_status(config: WorkbenchConfig) -> dict[str, Any]:
    missing = []
    if not config.asset_ftp_host:
        missing.append("ASSET_FTP_HOST")
    if not config.asset_ftp_username:
        missing.append("ASSET_FTP_USERNAME")
    if not config.asset_ftp_public_base_url:
        missing.append("ASSET_FTP_PUBLIC_BASE_URL")
    return {
        "configured": len(missing) == 0,
        "missingEnv": missing,
        "host": config.asset_ftp_host,
        "usernameConfigured": bool(config.asset_ftp_username),
        "publicBaseUrl": config.asset_ftp_public_base_url,
        "mode": "fallback_only",
    }


def verify_digi_path(config: WorkbenchConfig, storage_path: str) -> dict[str, Any]:
    normalized_path = normalize_storage_path(storage_path)
    checked_at = datetime.now(timezone.utc).isoformat()
    if not normalized_path:
        return {
            "storagePath": storage_path,
            "status": "unsupported",
            "exists": False,
            "downloadLinkAvailable": False,
            "checkedAt": checked_at,
            "lastError": "storagePath is required.",
        }
    try:
        client = DigiStorageClient(config)
        client.download_link(normalized_path)
        return {
            "storagePath": normalized_path,
            "status": "exists",
            "exists": True,
            "downloadLinkAvailable": True,
            "checkedAt": checked_at,
        }
    except DigiStorageUnavailable as error:
        return {
            "storagePath": normalized_path,
            "status": error.status,
            "exists": False,
            "downloadLinkAvailable": False,
            "checkedAt": checked_at,
            "lastError": str(error),
        }
    except Exception as error:
        return {
            "storagePath": normalized_path,
            "status": "error",
            "exists": False,
            "downloadLinkAvailable": False,
            "checkedAt": checked_at,
            "lastError": str(error),
        }


def fetch_digi_preview(config: WorkbenchConfig, storage_path: str, max_bytes: int = 8_000_000) -> dict[str, Any]:
    path = normalize_storage_path(storage_path)
    if not path:
        raise DigiStorageUnavailable("storagePath is required.", status="unsupported")
    link = DigiStorageClient(config).download_link(path)
    try:
        import httpx
    except Exception as error:
        raise DigiStorageUnavailable("httpx is not installed.", status="error") from error

    with httpx.Client(timeout=20, follow_redirects=True) as client:
        with client.stream("GET", link) as response:
            if response.status_code == 404:
                raise DigiStorageUnavailable("Digi Storage file was not found.", status="missing")
            if response.status_code in {401, 403}:
                raise DigiStorageUnavailable("Digi Storage download link was rejected.", status="auth_failed")
            if response.status_code >= 400:
                raise DigiStorageUnavailable(f"Digi Storage download failed with HTTP {response.status_code}.", status="error")
            declared_length = response.headers.get("content-length")
            if declared_length and int(declared_length) > max_bytes:
                raise DigiStorageUnavailable(f"Preview is larger than the {max_bytes} byte local limit.", status="too_large")
            chunks: list[bytes] = []
            total = 0
            for chunk in response.iter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    raise DigiStorageUnavailable(f"Preview is larger than the {max_bytes} byte local limit.", status="too_large")
                chunks.append(chunk)
            return {
                "content": b"".join(chunks),
                "contentType": response.headers.get("content-type") or "application/octet-stream",
                "contentLength": str(total),
            }


class DigiStorageClient:
    def __init__(self, config: WorkbenchConfig):
        self.config = config

    def authenticate(self) -> DigiAuthState:
        if not self.config.digi_storage_email or not self.config.digi_storage_password:
            raise DigiStorageUnavailable("Digi Storage credentials are not configured.", status="not_configured")
        try:
            import httpx
        except Exception as error:
            raise DigiStorageUnavailable("httpx is not installed.", status="error") from error

        with httpx.Client(timeout=10) as client:
            auth_response = client.post(
                f"{self.config.digi_storage_base_url}/token",
                headers={"accept": "application/json", "content-type": "application/json"},
                json={"email": self.config.digi_storage_email, "password": self.config.digi_storage_password},
            )
            if auth_response.status_code in {401, 403}:
                raise DigiStorageUnavailable("Digi Storage auth failed.", status="auth_failed")
            if auth_response.status_code >= 400:
                raise DigiStorageUnavailable(f"Digi Storage auth failed with HTTP {auth_response.status_code}.", status="error")
            token = (safe_json(auth_response).get("token") or "").strip()
            if not token:
                raise DigiStorageUnavailable("Digi Storage auth did not return a token.", status="auth_failed")
            mount_id = self.config.digi_storage_mount_id or self.primary_mount_id(client, token)
            return DigiAuthState(token=token, mount_id=mount_id)

    def primary_mount_id(self, client: Any, token: str) -> str:
        response = client.get(
            f"{self.config.digi_storage_api_url}/mounts?type=device",
            headers=digi_headers(token),
        )
        if response.status_code in {401, 403}:
            raise DigiStorageUnavailable("Digi Storage mount lookup was rejected.", status="auth_failed")
        if response.status_code >= 400:
            raise DigiStorageUnavailable(f"Digi Storage mount lookup failed with HTTP {response.status_code}.", status="error")
        mounts = safe_json(response).get("mounts") or []
        mount_id = next((str(mount.get("id")) for mount in mounts if mount.get("id")), "")
        if not mount_id:
            raise DigiStorageUnavailable("Digi Storage account has no device mount. Set DIGI_STORAGE_MOUNT_ID explicitly.", status="missing_mount")
        return mount_id

    def download_link(self, storage_path: str) -> str:
        auth = self.authenticate()
        try:
            import httpx
        except Exception as error:
            raise DigiStorageUnavailable("httpx is not installed.", status="error") from error

        with httpx.Client(timeout=10) as client:
            response = client.get(
                f"{self.config.digi_storage_api_url}/mounts/{auth.mount_id}/files/download",
                headers=digi_headers(auth.token),
                params={"path": storage_path},
            )
            if response.status_code == 404:
                raise DigiStorageUnavailable("Digi Storage file was not found.", status="missing")
            if response.status_code in {401, 403}:
                raise DigiStorageUnavailable("Digi Storage download-link lookup was rejected.", status="auth_failed")
            if response.status_code >= 400:
                raise DigiStorageUnavailable(f"Digi Storage download-link lookup failed with HTTP {response.status_code}.", status="error")
            link = safe_json(response).get("link")
            if not link:
                raise DigiStorageUnavailable("Digi Storage did not return a download link.", status="missing")
            return str(link)


def safe_json(response: Any) -> dict[str, Any]:
    try:
        payload = response.json()
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def digi_headers(token: str) -> dict[str, str]:
    return {"accept": "application/json", "authorization": f'Token token="{token}"'}


def normalize_storage_path(storage_path: str) -> str:
    path = (storage_path or "").strip()
    if not path:
        return ""
    return path if path.startswith("/") else f"/{path}"


def redacted_id(value: str) -> str:
    if len(value) <= 8:
        return "***"
    return f"{value[:4]}...{value[-4:]}"
