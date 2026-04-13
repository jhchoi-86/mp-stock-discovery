try {
    require('./analyzer.cjs');
    console.log('Syntax OK');
} catch (e) {
    console.error(e);
}
