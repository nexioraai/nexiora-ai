import AICommandBox from './command-center/AICommandBox'

export default function AICommandCenter() {
return (
<div style={{ marginTop: '40px' }}>

<h2
style={{
fontSize: '28px',
fontWeight: 'bold',
marginBottom: '20px'
}}
>
AI Command Center
</h2>

<AICommandBox />

</div>
)
}
