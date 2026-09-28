<?php

declare(strict_types=1);

/*
 * Development only: create a self-signed HTTPS certificate so phones on the
 * same Wi-Fi can open the Vite dev server with camera access (browsers allow
 * the camera only on HTTPS or localhost).
 *
 * Usage (from the repository root, run by scripts/dev-lan-https.ps1):
 *   php scripts/dev-lan-cert.php <output-dir> <lan-ip> [<lan-ip> ...]
 * Writes <output-dir>/dev-lan.key and <output-dir>/dev-lan.crt (valid 30 days).
 */

if ($argc < 3) {
    fwrite(STDERR, "Usage: php dev-lan-cert.php <output-dir> <lan-ip> [<lan-ip> ...]\n");
    exit(2);
}

$outDir = rtrim($argv[1], '/\\');
$addresses = array_slice($argv, 2);
foreach ($addresses as $address) {
    if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) === false) {
        fwrite(STDERR, "Not an IPv4 address: {$address}\n");
        exit(2);
    }
}
if (!is_dir($outDir) && !mkdir($outDir, 0700, true) && !is_dir($outDir)) {
    fwrite(STDERR, "Cannot create {$outDir}\n");
    exit(1);
}

$altNames = ['DNS:localhost', 'IP:127.0.0.1'];
foreach ($addresses as $address) {
    $altNames[] = 'IP:' . $address;
}

$configPath = tempnam(sys_get_temp_dir(), 'dentisys-cert');
file_put_contents($configPath, implode("\n", [
    '[req]',
    'distinguished_name = dn',
    'x509_extensions = v3_req',
    'prompt = no',
    '[dn]',
    'CN = DentiSys development (LAN)',
    '[v3_req]',
    'basicConstraints = CA:FALSE',
    'keyUsage = digitalSignature, keyEncipherment',
    'extendedKeyUsage = serverAuth',
    'subjectAltName = ' . implode(', ', array_unique($altNames)),
    '',
]));

$options = ['config' => $configPath, 'digest_alg' => 'sha256', 'x509_extensions' => 'v3_req'];
$key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_RSA, 'private_key_bits' => 2048, 'config' => $configPath]);
if ($key === false) {
    fwrite(STDERR, "Key generation failed.\n");
    exit(1);
}
$csr = openssl_csr_new(['commonName' => 'DentiSys development (LAN)'], $key, $options);
$cert = $csr === false ? false : openssl_csr_sign($csr, null, $key, 30, $options, random_int(1, PHP_INT_MAX));
if ($cert === false) {
    fwrite(STDERR, "Certificate generation failed.\n");
    exit(1);
}
openssl_pkey_export($key, $keyPem, null, ['config' => $configPath]);
openssl_x509_export($cert, $certPem);
unlink($configPath);

file_put_contents($outDir . '/dev-lan.key', $keyPem);
chmod($outDir . '/dev-lan.key', 0600);
file_put_contents($outDir . '/dev-lan.crt', $certPem);

echo 'Created ' . $outDir . '/dev-lan.crt for ' . implode(', ', $altNames) . " (valid 30 days)\n";
