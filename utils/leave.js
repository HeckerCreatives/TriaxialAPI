

exports.getLeaveTypeName = (type) => {
    const leaveTypes = {
        '1': 'Annual Leave',
        '2': 'Sick Leave',
        '3': "Carer's Leave",
        '4': 'Bereavement Leave',
        '5': 'Study Leave',
        '6': 'Long Services Leave',
        '7': 'Anniversary Day',
        '8': 'Paid Parental Leave',
        '9': 'Time in Lieu',
        '10': 'Other Leave'
    };
    return leaveTypes[type] || 'Unknown Leave Type';
};
