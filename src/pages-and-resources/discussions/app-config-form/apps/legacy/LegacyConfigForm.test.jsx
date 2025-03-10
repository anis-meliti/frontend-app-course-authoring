import React, { createRef } from 'react';

import {
  act,
  fireEvent,
  queryByLabelText,
  queryByRole,
  queryByTestId,
  queryByText,
  render,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';

import { initializeMockApp } from '@edx/frontend-platform';
import { getAuthenticatedHttpClient } from '@edx/frontend-platform/auth';
import { IntlProvider } from '@edx/frontend-platform/i18n';
import { AppProvider } from '@edx/frontend-platform/react';

import initializeStore from '../../../../../store';
import { executeThunk } from '../../../../../utils';
import { getAppsUrl } from '../../../data/api';
import { fetchApps } from '../../../data/thunks';
import { legacyApiResponse } from '../../../factories/mockApiResponses';
import messages from '../shared/messages';
import LegacyConfigForm from './LegacyConfigForm';

const courseId = 'course-v1:edX+TestX+Test_Course';
const defaultAppConfig = {
  id: 'legacy',
  divideByCohorts: false,
  divideCourseTopicsByCohorts: false,
  discussionTopics: [
    { name: 'General', id: 'course' },
    { name: 'Edx', id: '13f106c6-6735-4e84-b097-0456cff55960' },
  ],
  divideDiscussionIds: [
    'course',
    '13f106c6-6735-4e84-b097-0456cff55960',
  ],
  allowAnonymousPosts: false,
  allowAnonymousPostsPeers: false,
  allowDivisionByUnit: false,
  blackoutDates: [],
};
describe('LegacyConfigForm', () => {
  let axiosMock;
  let store;
  let container;

  beforeEach(() => {
    initializeMockApp({
      authenticatedUser: {
        userId: 3,
        username: 'abc123',
        administrator: true,
        roles: [],
      },
    });

    axiosMock = new MockAdapter(getAuthenticatedHttpClient());
    store = initializeStore();
  });

  afterEach(() => {
    axiosMock.reset();
  });

  const createComponent = (appConfig, onSubmit = jest.fn(), formRef = createRef()) => {
    const wrapper = render(
      <AppProvider store={store}>
        <IntlProvider locale="en">
          <LegacyConfigForm
            title="Test Legacy edX Discussions"
            appConfig={appConfig}
            onSubmit={onSubmit}
            formRef={formRef}
          />
        </IntlProvider>
      </AppProvider>,
    );
    container = wrapper.container;
    return container;
  };

  const mockStore = async (mockResponse) => {
    axiosMock.onGet(getAppsUrl(courseId)).reply(200, mockResponse);
    await executeThunk(fetchApps(courseId), store.dispatch);
  };

  test('title rendering', async () => {
    await mockStore(legacyApiResponse);
    createComponent(defaultAppConfig);

    expect(container.querySelector('h3')).toHaveTextContent('Test Legacy edX Discussions');
  });

  test('calls onSubmit when the formRef is submitted', async () => {
    const formRef = createRef();
    const handleSubmit = jest.fn();

    await mockStore(legacyApiResponse);
    createComponent({
      ...defaultAppConfig,
      divideByCohorts: true,
    }, handleSubmit, formRef);

    await act(async () => {
      formRef.current.submit();
    });

    expect(handleSubmit).toHaveBeenCalledWith(
      // Because we use defaultAppConfig as the initialValues of the form, and we haven't changed
      // any of the form inputs, this exact object shape is returned back to us, so we're reusing
      // it here.  It's not supposed to be 'the same object', it just happens to be.
      {
        ...defaultAppConfig,
        divideByCohorts: true,
      },
    );
  });

  test('default field states are correct, including removal of folded sub-fields', async () => {
    await mockStore(legacyApiResponse);
    createComponent(defaultAppConfig);

    // DivisionByGroupFields
    expect(container.querySelector('#divideByCohorts')).toBeInTheDocument();
    expect(container.querySelector('#divideByCohorts')).not.toBeChecked();
    expect(
      container.querySelector('#divideCourseTopicsByCohorts'),
    ).not.toBeInTheDocument();

    defaultAppConfig.divideDiscussionIds.forEach(id => expect(
      container.querySelector(`#checkbox-${id}`),
    ).not.toBeInTheDocument());

    // AnonymousPostingFields
    expect(container.querySelector('#allowAnonymousPosts')).toBeInTheDocument();
    expect(container.querySelector('#allowAnonymousPosts')).not.toBeChecked();
    expect(
      container.querySelector('#allowAnonymousPostsPeers'),
    ).not.toBeInTheDocument();

    // BlackoutDatesField
    expect(queryByText(container, messages.blackoutDatesLabel.defaultMessage)).toBeInTheDocument();
  });

  test('folded sub-fields are in the DOM when parents are enabled', async () => {
    await mockStore(legacyApiResponse);
    createComponent({
      ...defaultAppConfig,
      divideByCohorts: true,
      allowAnonymousPosts: true,
    });

    // DivisionByGroupFields
    expect(container.querySelector('#divideByCohorts')).toBeInTheDocument();
    expect(container.querySelector('#divideByCohorts')).toBeChecked();
    expect(
      container.querySelector('#divideCourseTopicsByCohorts'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('#divideCourseTopicsByCohorts'),
    ).not.toBeChecked();

    defaultAppConfig.divideDiscussionIds.forEach(id => expect(
      container.querySelector(`#checkbox-${id}`),
    ).not.toBeInTheDocument());

    // AnonymousPostingFields
    expect(container.querySelector('#allowAnonymousPosts')).toBeInTheDocument();
    expect(container.querySelector('#allowAnonymousPosts')).toBeChecked();
    expect(
      container.querySelector('#allowAnonymousPostsPeers'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('#allowAnonymousPostsPeers'),
    ).not.toBeChecked();
  });

  test('folded discussion topics are in the DOM when divideByCohorts and divideCourseWideTopics are enabled',
    async () => {
      await mockStore(legacyApiResponse);
      createComponent({
        ...defaultAppConfig,
        divideByCohorts: true,
        divideCourseTopicsByCohorts: true,
      });

      // DivisionByGroupFields
      expect(container.querySelector('#divideByCohorts')).toBeInTheDocument();
      expect(container.querySelector('#divideByCohorts')).toBeChecked();
      expect(container.querySelector('#divideCourseTopicsByCohorts')).toBeInTheDocument();
      expect(container.querySelector('#divideCourseTopicsByCohorts')).toBeChecked();

      defaultAppConfig.divideDiscussionIds.forEach(id => {
        expect(container.querySelector(`#checkbox-${id}`)).toBeInTheDocument();
        expect(container.querySelector(`#checkbox-${id}`)).toBeChecked();
      });
    });

  const updateTopicName = async (topicId, topicName) => {
    const topicCard = queryByTestId(container, topicId);

    userEvent.click(queryByLabelText(topicCard, 'Expand'));
    const topicInput = topicCard.querySelector('input');
    topicInput.focus();
    await act(async () => { fireEvent.change(topicInput, { target: { value: topicName } }); });
    topicInput.blur();

    return topicCard;
  };

  const assertTopicNameRequiredValidation = (topicCard, expectExists = true) => {
    const error = queryByText(topicCard, messages.discussionTopicRequired.defaultMessage);
    if (expectExists) { expect(error).toBeInTheDocument(); } else { expect(error).not.toBeInTheDocument(); }
  };

  const assertDuplicateTopicNameValidation = async (topicCard, expectExists = true) => {
    const error = queryByText(topicCard, messages.discussionTopicNameAlreadyExist.defaultMessage);
    if (expectExists) { expect(error).toBeInTheDocument(); } else { expect(error).not.toBeInTheDocument(); }
  };

  const assertHasErrorValidation = (expectExists = true) => {
    expect(store.getState().discussions.hasValidationError).toBe(expectExists);
  };

  test('show required error on field when leaving empty topic name',
    async () => {
      await mockStore(legacyApiResponse);
      createComponent(defaultAppConfig);

      const topicCard = await updateTopicName('13f106c6-6735-4e84-b097-0456cff55960', '');
      await waitForElementToBeRemoved(queryByText(topicCard, messages.addTopicHelpText.defaultMessage));
      assertTopicNameRequiredValidation(topicCard);
      assertHasErrorValidation();
    });

  test('check field is not collapsible in case of error', async () => {
    await mockStore(legacyApiResponse);
    createComponent(defaultAppConfig);

    const topicCard = await updateTopicName('13f106c6-6735-4e84-b097-0456cff55960', '');
    const collapseButton = queryByLabelText(topicCard, 'Collapse');
    await act(async () => userEvent.click(collapseButton));

    expect(collapseButton).toBeInTheDocument();
  });

  describe('Duplicate validation test cases', () => {
    let topicCard;
    let duplicateTopicCard;

    beforeEach(async () => {
      await mockStore(legacyApiResponse);
      createComponent(defaultAppConfig);

      topicCard = await updateTopicName('course', 'edx');
      duplicateTopicCard = await updateTopicName('13f106c6-6735-4e84-b097-0456cff55960', 'EDX');
    });

    test('show duplicate errors on fields when passing duplicate topic name', async () => {
      await assertDuplicateTopicNameValidation(topicCard);
      await assertDuplicateTopicNameValidation(duplicateTopicCard);
      assertHasErrorValidation();
    });

    test('check duplicate error is removed on fields when name is fixed', async () => {
      const duplicateTopicInput = duplicateTopicCard.querySelector('input');

      duplicateTopicInput.focus();
      userEvent.type(duplicateTopicInput, 'valid');
      duplicateTopicInput.blur();

      await waitForElementToBeRemoved(
        queryByText(duplicateTopicCard, messages.discussionTopicNameAlreadyExist.defaultMessage),
      );
      await assertDuplicateTopicNameValidation(duplicateTopicCard, false, false);
      await assertDuplicateTopicNameValidation(topicCard, false, false);
      assertHasErrorValidation(false);
    });

    test('check duplicate error is removed on deleting duplicate topic', async () => {
      userEvent.click(
        queryByLabelText(duplicateTopicCard, messages.deleteAltText.defaultMessage, { selector: 'button' }),
      );
      userEvent.click(
        queryByRole(container, 'button', { name: messages.deleteButton.defaultMessage }),
      );

      await waitForElementToBeRemoved(queryByText(topicCard, messages.discussionTopicNameAlreadyExist.defaultMessage));

      expect(duplicateTopicCard).not.toBeInTheDocument();
      await assertDuplicateTopicNameValidation(topicCard, false, false);
      assertHasErrorValidation(false);
    });
  });
});
