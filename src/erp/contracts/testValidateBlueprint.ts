import { validateBlueprint } from './validateBlueprint'

const blueprint = {
models: [
{
name: 'customers',

fields: [
{
name: 'customer_id',
type: 'id'
},
{
name: 'email',
type: 'string'
}
]
}
]
}

console.log(
validateBlueprint(
blueprint as any
)
)
