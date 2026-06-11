import fs from 'fs'
import path from 'path'

export function writeAgentPages(erp: any) {

const baseDir = path.join(
process.cwd(),
'src/app/generated'
)

if (!erp.agents) {
return
}

const agentDir = path.join(
baseDir,
'agents'
)

fs.mkdirSync(agentDir, {
recursive: true
})

fs.writeFileSync(
path.join(agentDir, 'page.tsx'),
`
export default function AgentsPage() {

const agents = ${JSON.stringify(
erp.agents,
null,
2
)}

return (
<div style={{ padding: 40 }}>
<h1>AI Agents</h1>

{agents.map((agent: string) => (
<div
key={agent}
style={{
border: '1px solid #ddd',
padding: 20,
marginTop: 10,
borderRadius: 10
}}
>
{agent}
</div>
))}
</div>
)
}
`
)

return true
}
