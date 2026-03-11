ALTER TABLE `monitor_configs` 
ADD COLUMN `appkey` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'AppKey',
DROP INDEX `uniq_configs_project_env_customer`,
ADD UNIQUE KEY `uk_appkey_customer` (`appkey`, `customer_name`),
ADD KEY `idx_appkey` (`appkey`),
ADD KEY `idx_customer` (`customer_name`);
