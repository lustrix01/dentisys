UPDATE user_accounts SET password_hash = '$2y$10$svr00Fut.38haHTd27zuIe3YLOXZepPubkMkF8K5Q49ytCgjy28Vu' WHERE login_email = 'admin@bicol-u.edu.ph';
UPDATE user_accounts SET password_hash = '$2y$10$3OfHmV2FaxfK911l8ZZxV.paOsQVbJTTwTtEtzPkxY3TEv9xyDBlm' WHERE role = 'faculty';
UPDATE user_accounts SET password_hash = '$2y$10$GZiQTRYcddOZ6iml/GBtI.4usZeczmzJWgiqCn1iYHfd2eUiOBLhq' WHERE login_email = 'secretary@bicol-u.edu.ph';
