import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
export const requiredHeaders = [
  'agent',
  'firstname',
  'dob',
  'address',
  'phone',
  'state',
  'zip',
  'email',
  'gender',
  'userType',
  'account_name',
  'category_name',
  'company_name',
  'policy_number',
  'policy_start_date',
  'policy_end_date',
];
export const key = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
export function date(value, field) {
  const text =
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').trim();
  const parsed = DateTime.fromFormat(text, 'yyyy-MM-dd', { zone: 'UTC' });
  if (!parsed.isValid) throw new Error(`${field} must be a valid YYYY-MM-DD date`);
  return parsed.toJSDate();
}
export function normalize(row) {
  const get = (name) => String(row[name] ?? '').trim();
  for (const field of [
    'agent',
    'firstname',
    'dob',
    'email',
    'account_name',
    'category_name',
    'company_name',
    'policy_number',
  ]) {
    if (!get(field) || get(field).length > 500)
      throw new Error(`${field} is required and must be at most 500 characters`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get('email'))) throw new Error('email is invalid');
  const dob = date(row.dob, 'dob');
  const startDate = date(row.policy_start_date, 'policy_start_date');
  const endDate = date(row.policy_end_date, 'policy_end_date');
  if (endDate < startDate) throw new Error('policy end date precedes start date');
  const email = key(row.email);
  const firstnameKey = key(row.firstname);
  // Sample emails are not unique people. Preserve names/DOB instead of merging by email.
  const identity = createHash('sha256')
    .update(JSON.stringify([email, firstnameKey, dob.toISOString()]))
    .digest('hex');
  return {
    agent: get('agent'),
    account: get('account_name'),
    category: get('category_name'),
    carrier: get('company_name'),
    user: {
      identity,
      firstname: get('firstname'),
      firstnameKey,
      dob,
      email,
      address: get('address'),
      phone: get('phone'),
      state: get('state'),
      zip: get('zip'),
      gender: get('gender'),
      userType: get('userType'),
    },
    policy: { policyNumber: get('policy_number'), startDate, endDate },
  };
}
