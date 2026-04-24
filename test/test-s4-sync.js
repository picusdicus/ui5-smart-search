require('dotenv').config()
const { fullSync, deltaSync } = require('../srv/lib/s4-sync')

async function test() {

  console.log('\n--- Test 1: Full Sync ---')
  const result = await fullSync()
  console.log('Result:', result)

  console.log('\n--- Test 2: Delta Sync ---')
  const delta = await deltaSync()
  console.log('Delta result:', delta)

}

test()
  .then(() => console.log('\n✅ Sync complete'))
  .catch(err => console.error('\n❌ Sync failed:', err.message))