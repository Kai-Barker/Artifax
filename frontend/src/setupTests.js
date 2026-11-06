// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom doesn't implement scrollIntoView; components call it when selecting list items.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// Each test starts with a clean, logged-out browser state.
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
