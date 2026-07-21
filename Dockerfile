FROM php:8.2.12-apache-bookworm

RUN docker-php-ext-install -j"$(nproc)" pdo_mysql \
    && a2enmod rewrite

WORKDIR /var/www/html

RUN sed -ri 's!/var/www/html!/var/www/html/backend/public!g' /etc/apache2/sites-available/*.conf \
    && sed -ri 's!/var/www/!/var/www/html/backend/public!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

COPY --chown=www-data:www-data backend/ /var/www/html/backend/
COPY --chown=www-data:www-data tests/ /var/www/html/tests/

EXPOSE 80
