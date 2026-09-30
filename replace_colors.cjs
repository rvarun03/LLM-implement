const fs = require('fs');
const path = require('path');

const filesToReplace = [
  path.join(__dirname, 'App.tsx'),
  path.join(__dirname, 'components', 'Dashboard.tsx')
];

filesToReplace.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace #14b8a6 and #14B8A6 (case insensitive) with #00E1C5
  content = content.replace(/#14b8a6/gi, '#00E1C5');
  
  // Replace #00E5BE and #00e5be with #00E1C5
  content = content.replace(/#00E5BE/gi, '#00E1C5');
  content = content.replace(/#00e5be/gi, '#00E1C5');
  
  // Replace #0D9488 and #0d9488 with #009B87
  content = content.replace(/#0D9488/gi, '#009B87');
  content = content.replace(/#0d9488/gi, '#009B87');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Replaced colors in ${path.basename(filePath)}`);
});
