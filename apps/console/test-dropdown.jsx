const React = require('react');
const { renderToString } = require('react-dom/server');
const { Dropdown } = require('antd');

try {
  renderToString(
    <Dropdown menu={(e) => ({ items: [] })}>
      <span>Trigger</span>
    </Dropdown>
  );
  console.log('Success');
} catch (e) {
  console.error(e.message);
}
