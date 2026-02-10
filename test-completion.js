// Quick test to verify the endpoint works
const API_URL = 'https://moveify-app-production.up.railway.app/api';

async function testCompletionEndpoint() {
  // Replace with actual patient ID
  const patientId = 1; // Update this with a real patient ID
  
  console.log('Testing exercise completions endpoint...');
  console.log(`URL: ${API_URL}/programs/exercise-completions/patient/${patientId}?days=30`);
  
  try {
    const response = await fetch(`${API_URL}/programs/exercise-completions/patient/${patientId}?days=30`);
    console.log('Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Success! Data received:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('Error response:', await response.text());
    }
  } catch (error) {
    console.error('Fetch error:', error.message);
  }
}

testCompletionEndpoint();
