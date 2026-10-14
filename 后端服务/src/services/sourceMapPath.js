function validateSegment(value, label) {
    if (typeof value !== 'string' || !value || value === '.' || value === '..' || /[/\\:\u0000]/.test(value)) {
        throw new Error(label + ' 必须是单个有效路径段');
    }
    return value;
}

module.exports = { validateSegment };
