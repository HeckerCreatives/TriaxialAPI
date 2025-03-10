const moment = require('moment');


exports.formatDate = (dateString) => {
    return moment(dateString).format('DD/MM/YYYY');
};

exports.formatDateRange = (startDate, endDate) => {
    if (!startDate || !endDate) {
        return formatDate(startDate);
    }
    
    if (moment(startDate).isSame(endDate, 'day')) {
        return formatDate(startDate);
    }
    
    return `${formatDate(startDate)} until ${formatDate(endDate)}`;
};
