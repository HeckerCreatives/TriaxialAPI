const moment = require('moment');


exports.formatDate = (dateString) => {
    return moment(dateString).format('DD/MM/YYYY');
};

exports.formatDateRange = (startDate, endDate) => {
    if (!startDate || !endDate) {
        return this.formatDate(startDate);
    }
    
    if (moment(startDate).isSame(endDate, 'day')) {
        return this.formatDate(startDate);
    }
    
    return `${this.formatDate(startDate)} until ${this.formatDate(endDate)}`;
};
