require('dotenv').config()
const { 
  fetchBusinessPartners, 
  fetchBusinessPartnerById 
} = require('../srv/lib/s4-client')

async function test() {

  console.log('\n--- Test 1: Fetch Business Partners ---')
  const partners = await fetchBusinessPartners(5)
  console.log(`Fetched ${partners.length} partners`)
  console.log('First record:', JSON.stringify(partners[0], null, 2))

  console.log('\n--- Test 2: Fetch Single BP ---')
  const firstId = partners[0].id
  const single = await fetchBusinessPartnerById(firstId)
  console.log(`Fetched BP ${firstId}:`, JSON.stringify(single, null, 2))

}

test()
  .then(() => console.log('\n✅ All tests passed'))
  .catch(err => console.error('\n❌ Test failed:', err.message))