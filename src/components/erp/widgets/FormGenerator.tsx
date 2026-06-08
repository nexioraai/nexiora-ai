type Props = {
fields: string[]
title: string
}

export default function FormGenerator({
fields,
title
}: Props) {

return (
<div>

<h1>{title}</h1>

<form
style={{
display: "flex",
flexDirection: "column",
gap: 12,
maxWidth: 500
}}
>

{fields.map(field => (
<input
key={field}
placeholder={field}
style={{
padding: 10,
border: "1px solid #ddd"
}}
/>
))}

<button
type="submit"
style={{
padding: 12
}}
>
Enregistrer
</button>

</form>

</div>
)
}
