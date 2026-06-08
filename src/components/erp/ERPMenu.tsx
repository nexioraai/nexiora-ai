import Link from "next/link";

const modules = [
"customers",
"suppliers",
"products",
"inventory",
"purchase_orders",
"sales_orders",
"invoices",
"payments"
];

export default function ERPMenu() {
return (
<div
style={{
width: 220,
minHeight: "100vh",
borderRight: "1px solid #ddd",
padding: 20,
}}
>
<h2>Nexiora ERP</h2>

{modules.map((module) => (
<div key={module} style={{ marginTop: 12 }}>
<Link href={`/generated/${module}`}>
{module}
</Link>
</div>
))}
</div>
);
}
