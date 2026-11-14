'use strict';

module.exports = {
  async getRecent({ homey }) {
    return homey.app.recent();
  },
};
