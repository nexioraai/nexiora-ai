'use client'

import { useEffect, useState } from 'react'

export default function CustomersPage() {
const [customers, setCustomers] = useState([])

useEffect(() => {
fetch('/api/customers')
.then((res) => res.json())
.then((data) => setCustomers(data))
}, [])

return (
<div style={{ padding: '40px' }}>
<h1>Customers</h1>

<table>
<thead>
<tr>
<th>Company</th>
<th>Contact</th>
<th>City</th>
<th>Country</th>
</tr>
</thead>

<tbody>
{customers.map((c: any) => (
<tr key={c.id}>
<td>{c.company_name}</td>
<td>{c.contact_name}</td>
<td>{c.city}</td>
<td>{c.country}</td>
</tr>
))}
</tbody>
</table>
</div>
)
}
