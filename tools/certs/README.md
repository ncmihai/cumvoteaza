# Certificates

`globalsign-gcc-r6-alphassl-ca-2025.pem` is the public intermediate certificate (GlobalSign GCC R6 AlphaSSL CA 2025) that signed `*.mdlpa.ro`. That site sends its own certificate without it, so a browser fetches it from the
address in the certificate ("CA Issuers", `http://secure.globalsign.com/cacert/gsgccr6alphasslca2025.crt`) and Node does not. `ministries:sites:fetch` hands it to Node with `NODE_EXTRA_CA_CERTS`; verification stays on and
the chain checks out to the GlobalSign R6 root. It expires on 2027-05-21: fetch the new one from the same address then.
