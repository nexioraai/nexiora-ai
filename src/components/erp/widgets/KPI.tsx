export default function KPI({
title,
value,
}: {
title: string;
value: string;
}) {
return (
<div
style={{
border: "1px solid #ddd",
borderRadius: 8,
padding: 20,
minWidth: 180,
}}
>
<div>{title}</div>
<h2>{value}</h2>
</div>
);
}
