FROM php:8.2.12-apache-bookworm

RUN docker-php-ext-install -j"$(nproc)" pdo_mysql \
    && a2enmod rewrite

WORKDIR /var/www/html

COPY backend/ /var/www/html/

RUN chown -R www-data:www-data /var/www/html

EXPOSE 80
