export function processTemplate(
  template: string,
  data: {
    tenantName: string;
    unitName: string;
    propertyName: string;
    rentAmount: string;
    dueDate: string;
  }
): string {
  return template
    .replace(/{{tenantName}}/g, data.tenantName)
    .replace(/{{unitName}}/g, data.unitName)
    .replace(/{{propertyName}}/g, data.propertyName)
    .replace(/{{rentAmount}}/g, data.rentAmount)
    .replace(/{{dueDate}}/g, data.dueDate);
}
