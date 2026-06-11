import fs from 'fs'
import path from 'path'

export function cleanupGenerated() {

const generatedDir = path.join(
process.cwd(),
'src/app/generated'
)

if (fs.existsSync(generatedDir)) {
fs.rmSync(generatedDir, {
recursive: true,
force: true
})
}

fs.mkdirSync(generatedDir, {
recursive: true
})

console.log('GENERATED FOLDER CLEANED')

return true
}
