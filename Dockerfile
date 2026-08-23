FROM nginx:alpine

COPY ["Gestión Pagos/", "/usr/share/nginx/html/"]

EXPOSE 80