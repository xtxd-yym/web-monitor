function readinessHandler(_req, res) {
    return res.status(200).json({ status: 'ready' });
}

module.exports = {
    readinessHandler
};
