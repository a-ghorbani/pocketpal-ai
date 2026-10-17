const deleteAccount = jest.fn().mockResolvedValue({kind: 'cancelled'});

module.exports = {deleteAccount};
