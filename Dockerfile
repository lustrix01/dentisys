FROM composer:2 AS composer
WORKDIR /app
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --classmap-authoritative

FROM php:8.4-apache-bookworm AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev \
    && rm -rf /var/lib/apt/lists/* \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql \
    && a2enmod rewrite

WORKDIR /var/www/html
RUN sed -ri 's!/var/www/html!/var/www/html/backend/public!g' /etc/apache2/sites-available/*.conf \
    && sed -ri 's!/var/www/!/var/www/html/backend/public!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

COPY --chown=www-data:www-data backend/ /var/www/html/backend/
COPY --from=composer --chown=www-data:www-data /app/vendor /var/www/html/backend/vendor
EXPOSE 80
