import { MODULES } from './module-registry';

export function generateERP(type: keyof typeof MODULES) {
const template = MODULES[type];

return {
name: template.name,

modules: template.modules,

pages: template.modules.map((module: string) => ({
name: module,
route: '/' + module,

navigation: {
create: '/' + module + '/new',
list: '/' + module,
edit: '/' + module + '/edit',
},
})),

generatedAt: new Date().toISOString(),
};
}