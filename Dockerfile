# ============================================================================
#  Straßenfest-Bestell-App  ·  PHP + Apache
#  Baut ein fertiges Image, das du in Docker Desktop starten kannst.
# ============================================================================
FROM php:8.2-apache

# Datenbank-Unterstützung für PHP: SQLite (lokal) + MySQL (Webspace)
RUN apt-get update \
 && apt-get install -y --no-install-recommends libsqlite3-dev \
 && docker-php-ext-install pdo_sqlite pdo_mysql \
 && rm -rf /var/lib/apt/lists/*

# .htaccess erlauben (Schutz von config.php/db.php) + saubere URLs
RUN a2enmod rewrite headers \
 && sed -ri 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# App-Dateien ins Web-Verzeichnis kopieren
COPY . /var/www/html/

# Datenordner AUSSERHALB des Web-Roots (nicht über den Browser erreichbar),
# wird per Volume dauerhaft gespeichert.
ENV SF_DATA_DIR=/data
RUN mkdir -p /data && chown -R www-data:www-data /data /var/www/html

# Im Container nicht benötigte Quell-/Build-Dateien entfernen
# (Getränkebilder in bilder/Getränke bleiben erhalten!)
RUN rm -rf /var/www/html/docs /var/www/html/data

EXPOSE 80
