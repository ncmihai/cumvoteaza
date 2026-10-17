# Certificates

`intermediates.pem` holds the public intermediate certificates of sites that send their own certificate without the one that signed it. A browser fetches the missing one by itself from the address the certificate names
("CA Issuers"); Node does not. `ministries:sites:fetch` hands the file to Node with `NODE_EXTRA_CA_CERTS`: verification stays on, and each chain checks out to a root already trusted by the system.

- GlobalSign GCC R6 AlphaSSL CA 2025, for `*.mdlpa.ro` (expires 2027-05-21), from `http://secure.globalsign.com/cacert/gsgccr6alphasslca2025.crt`.
- GoGetSSL RSA DV SSL CA 2, for `*.madr.ro` (expires 2035-08-19), from `http://crt.sectigo.com/GoGetSSLRSADVSSLCA2.crt`.

To add one: `openssl s_client -connect HOST:443 -servername HOST | openssl x509 -noout -text` shows its "CA Issuers" address; convert the file with `openssl x509 -inform DER -outform PEM` and append it with a comment line.
