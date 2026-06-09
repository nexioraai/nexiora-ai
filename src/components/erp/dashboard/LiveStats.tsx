'use client'

import { useEffect, useState } from 'react'

export default function LiveStats() {
const [stats, setStats] = useState({
customers: 0,
suppliers: 0,
products: 0,
invoices: 0,
})

useEffect(() => {
fetch('/api/stats')
.then((res) => res.json())
.then((data) => setStats(data))
}, [])

return (
<div className="grid grid-cols-4 gap-4">
<div>
<h3>Customers</h3>
<p>{stats.customers}</p>
</div>

<div>
<h3>Suppliers</h3>
<p>{stats.suppliers}</p>
</div>

<div>
<h3>Products</h3>
<p>{stats.products}</p>
</div>

<div>
<h3>Invoices</h3>
<p>{stats.invoices}</p>
</div>
</div>
)
}
