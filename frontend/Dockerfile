FROM nginx:alpine

# Patch OS-level vulnerabilities in Alpine (libpng, zlib, etc.)
RUN apk update && apk upgrade --no-cache

# Create non-root user and fix permissions for Nginx on port 8080
RUN touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /var/log/nginx /etc/nginx/conf.d

USER nginx

COPY --chown=nginx:nginx . /usr/share/nginx/html

# Remove the default config and add our custom one
RUN rm /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
