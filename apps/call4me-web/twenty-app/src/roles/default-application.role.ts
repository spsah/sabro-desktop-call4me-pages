import { defineApplicationRole } from 'twenty-sdk/define';

export default defineApplicationRole({
  universalIdentifier: '5bf1b9e6-71db-4bfc-b337-c07d789a0a2a',
  label: 'SABRO Calling app role',
  description: 'Minimum role used by the embedded calling app.',
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
});
