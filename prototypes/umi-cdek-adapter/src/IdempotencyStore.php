<?php

declare(strict_types=1);

namespace TerraTectra\UmiCdek;

use RuntimeException;

final class IdempotencyStore
{
    public function __construct(private readonly string $path)
    {
    }

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->read());
    }

    /** @param array<string,mixed> $result */
    public function remember(string $key, array $result): void
    {
        $data = $this->read();
        $data[$key] = ['stored_at' => date(DATE_ATOM), 'result' => $result];
        $dir = dirname($this->path);
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException('Cannot create state directory');
        }
        $tmp = $this->path . '.tmp';
        if (file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX) === false) {
            throw new RuntimeException('Cannot write idempotency state');
        }
        chmod($tmp, 0600);
        if (!rename($tmp, $this->path)) {
            @unlink($tmp);
            throw new RuntimeException('Cannot replace idempotency state');
        }
    }

    /** @return array<string,mixed> */
    private function read(): array
    {
        if (!is_file($this->path)) {
            return [];
        }
        $decoded = json_decode((string)file_get_contents($this->path), true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Invalid idempotency state');
        }
        return $decoded;
    }
}
