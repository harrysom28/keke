# Proxy timeouts for POST /api/driver/create (4-photo multipart)
#
# There is no Nginx/Traefik config checked into this repo. Production sits
# behind Dokploy's reverse proxy (typically Traefik). Defaults for many
# proxies are ~60s read timeout and 1m body size — too low for 4 compressed
# JPEGs on slow mobile data.
#
# App note: Cloudinary uploads now run AFTER the 201 response (background),
# so proxy read timeout mainly covers receiving the multipart body + DB
# write, not Cloudinary. Body size and upload-duration limits still matter.
#
# BEFORE (typical Dokploy/Traefik/Nginx defaults — confirm in your panel):
#   client_max_body_size / maxRequestBodyBytes : 1m
#   proxy_read_timeout / respondingTimeouts.readTimeout : 60s
#   proxy_send_timeout / respondingTimeouts.writeTimeout : 60s
#
# AFTER (apply these in Dokploy → your API service → proxy / Traefik labels,
# or paste the Nginx snippet into a custom config):
#   client_max_body_size : 50m
#   proxy_read_timeout   : 180s
#   proxy_send_timeout   : 180s
#   proxy_connect_timeout: 60s
#
# App-side values changed in this same change set:
#   Multer on /driver/create : fileSize 10MB (unchanged), files=8, fields=40 (new)
#   Cloudinary SDK timeout   : default 120000ms → 180000ms
#   express.json limit       : 10mb (unchanged; multipart bypasses JSON parser)

## Nginx snippet (if Dokploy uses Nginx in front of the container)
# location /api/driver/create {
#   client_max_body_size 50m;
#   proxy_connect_timeout 60s;
#   proxy_send_timeout 180s;
#   proxy_read_timeout 180s;
#   proxy_request_buffering off;
#   proxy_pass http://api:8000;
# }

## Traefik v2/v3 labels (attach to the API service in Dokploy)
# labels:
#   - "traefik.http.middlewares.driver-upload-buffering.buffering.maxRequestBodyBytes=52428800"
#   - "traefik.http.services.keke-api.loadbalancer.responseforwarding.flushinterval=1s"
# And set the entrypoint/router transport read/write timeouts to 180s in the
# Dokploy Traefik file provider (or dynamic config):
#   respondingTimeouts:
#     readTimeout: 180s
#     writeTimeout: 180s
#     idleTimeout: 180s
