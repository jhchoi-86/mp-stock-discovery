const { runPhase1 } = require('./sync/phase1_snapshot.cjs');
runPhase1().then(() => {
  console.log('MANUAL_PHASE1_DONE');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
