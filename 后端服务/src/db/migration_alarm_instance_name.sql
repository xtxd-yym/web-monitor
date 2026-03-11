-- Migration: Add instance_name and instance_uuid to alarm_records
-- For existing MySQL deployments
-- Execute this script to add the new columns for preserving alarm instance info

ALTER TABLE `alarm_records`
ADD COLUMN `instance_name` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '实例名称(快照)' AFTER `instance_id`,
ADD COLUMN `instance_uuid` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '实例ID字符串(快照)' AFTER `instance_name`;
