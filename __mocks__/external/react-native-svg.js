const React = require('react');
const {View} = require('react-native');

const SvgMock = props => React.createElement(View, props);
SvgMock.default = SvgMock;
SvgMock.__esModule = true;

module.exports = SvgMock;
