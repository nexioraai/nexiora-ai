export function buildPages(modules: string[]) {
  return modules.map((module) => ({
    name: module,
    route: '/' + module,

    navigation: {
      create: `/${module}/new`,
      list: `/${module}`,
      edit: `/${module}/edit`
    }
  }))
}