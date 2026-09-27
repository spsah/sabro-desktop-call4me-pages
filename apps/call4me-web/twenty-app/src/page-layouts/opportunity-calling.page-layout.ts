import {
  PageLayoutTabLayoutMode,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  definePageLayout,
} from 'twenty-sdk/define';

import { CALL_FROM_DEAL_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/constants/call-from-deal-front-component-universal-identifier';

const opportunityFieldsView =
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.views
    .opportunityRecordPageFields.universalIdentifier;

export default definePageLayout({
  universalIdentifier: 'd9747819-ab1a-4b77-bbf1-4766137dfd3c',
  name: 'Opportunity with Calling',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  tabs: [
    {
      universalIdentifier: '50407193-393c-4c10-bada-e6ae912889b8',
      title: 'Home',
      position: 10,
      icon: 'IconHome',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: 'ce713676-e631-4aaa-8892-2defcf40a59a',
          title: 'Fields',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
            viewUniversalIdentifier: opportunityFieldsView,
          },
        },
      ],
    },
    {
      universalIdentifier: 'b908506c-f6ef-4382-9161-3b6e3aa835a9',
      title: 'Call',
      position: 20,
      icon: 'IconPhone',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: 'b89e2b49-4c99-45c5-ad21-d5db95205ad9',
          title: 'Call customer',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier:
              CALL_FROM_DEAL_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
          },
        },
      ],
    },
    {
      universalIdentifier: '72675cba-b30d-4527-acb2-24907a4467ea',
      title: 'Timeline',
      position: 30,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: 'c5f4655f-9352-47c6-8d17-c6f739e7f0a7',
          title: 'Timeline',
          type: 'TIMELINE',
          configuration: {
            configurationType: 'TIMELINE',
          },
        },
      ],
    },
  ],
});
