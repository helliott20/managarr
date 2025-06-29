// Simple script to update rules.js to use the correct rating field
const fs = require('fs');
const path = require('path');

const rulesPath = path.join(__dirname, 'routes', 'rules.js');

try {
  // Read the current rules.js file
  let content = fs.readFileSync(rulesPath, 'utf8');
  
  // Replace the rating filter logic to use both direct field and metadata fallback
  content = content.replace(
    'const rating = file.metadata?.rating;',
    'const rating = file.rating || file.metadata?.rating;'
  );
  
  // Write the updated content back
  fs.writeFileSync(rulesPath, content, 'utf8');
  
  console.log('✅ Successfully updated rules.js to use enhanced rating filter logic');
  console.log('Rating filters will now check both the direct rating field and metadata fallback');
  
} catch (error) {
  console.error('❌ Error updating rules.js:', error.message);
}
