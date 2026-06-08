type Props = {
fields: string[]
}

export default function DataTable({ fields }: Props) {
return (
<table
style={{
width: "100%",
borderCollapse: "collapse"
}}
>
<thead>
<tr>
{fields.map(field => (
<th
key={field}
style={{
border: "1px solid #ddd",
padding: 10
}}
>
{field}
</th>
))}
<th
style={{
border: "1px solid #ddd",
padding: 10
}}
>
Actions
</th>
</tr>
</thead>

<tbody>
<tr>
{fields.map(field => (
<td
key={field}
style={{
border: "1px solid #ddd",
padding: 10
}}
>
demo {field}
</td>
))}
<td
style={{
border: "1px solid #ddd",
padding: 10
}}
>
Modifier Supprimer
</td>
</tr>
</tbody>

</table>
)
}
