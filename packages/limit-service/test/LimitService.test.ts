// Switch these lines once there are useful utils
// const testUtils = require('./utils');
import './utils';

import should from 'should';
import sinon from 'sinon';
import LimitService from '../src/LimitService';
import {FlagLimit, MaxLimit, MaxPeriodicLimit} from '../src/limit';

import errors from './fixtures/errors';

describe('Limit Service', function () {
    describe('Error Messages', function () {
        it('Formats numbers correctly', function () {
            const limit = new MaxLimit({
                name: 'test',
                config: {
                    max: 35000000,
                    currentCountQuery: async () => undefined,
                    error: 'Your plan supports up to {{max}} staff users. Please upgrade to add more.'
                },
                errors
            });

            const error = limit.generateError(35000001);

            error.message.should.eql('Your plan supports up to 35,000,000 staff users. Please upgrade to add more.');
            error.errorDetails.limit.should.eql(35000000);
            error.errorDetails.total.should.eql(35000001);
        });

        it('Supports {{max}}, {{count}}, and {{name}} variables', function () {
            const limit = new MaxLimit({
                name: 'Test Resources',
                config: {
                    max: 5,
                    currentCountQuery: async () => undefined,
                    error: '{{name}} limit reached. Your plan supports up to {{max}} staff users. You are currently at {{count}} staff users.Please upgrade to add more.'
                },
                errors
            });

            const error = limit.generateError(7);

            error.message.should.eql('Test Resources limit reached. Your plan supports up to 5 staff users. You are currently at 7 staff users.Please upgrade to add more.');
            error.errorDetails.name.should.eql('Test Resources');
            error.errorDetails.limit.should.eql(5);
            error.errorDetails.total.should.eql(7);
        });
    });

    describe('Loader', function () {
        it('throws if errors configuration is not specified', function () {
            const limitService = new LimitService();

            const limits = {staff: {max: 2}};

            try {
                limitService.loadLimits({limits});
                should.fail(limitService, 'Should have errored');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
                should.exist(err);
                err.message.should.eql(`Config Missing: 'errors' is required.`);
            }
        });

        it('can load a max limit', function () {
            const limitService = new LimitService();

            const limits = {staff: {max: 2}};

            limitService.loadLimits({limits, errors});

            limitService.limits.should.be.an.Object().with.properties(['staff']);
            limitService.limits.staff.should.be.an.instanceOf(MaxLimit);
            limitService.isLimited('staff').should.be.true();
            limitService.isLimited('members').should.be.false();
        });

        it('can load a periodic max limit', function () {
            const limitService = new LimitService();

            const limits = {
                emails: {
                    maxPeriodic: 3
                }
            };

            const subscription = {
                interval: 'month' as const,
                startDate: '2021-09-18T19:00:52Z'
            };

            limitService.loadLimits({limits, subscription, errors});

            limitService.limits.should.be.an.Object().with.properties(['emails']);
            limitService.limits.emails.should.be.an.instanceOf(MaxPeriodicLimit);
            limitService.isLimited('emails').should.be.true();
            limitService.isLimited('staff').should.be.false();
        });

        it('throws when loadding a periodic max limit without a subscription', function () {
            const limitService = new LimitService();

            const limits = {
                emails: {
                    maxPeriodic: 3
                }
            };

            try {
                limitService.loadLimits({limits, errors});
                throw new Error('Should have failed earlier...');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                error.errorType.should.equal('IncorrectUsageError');
                error.message.should.match(/periodic max limit without a subscription/);
            }
        });

        it('can load multiple limits', function () {
            const limitService = new LimitService();

            const limits = {
                staff: {max: 2},
                members: {max: 100},
                emails: {disabled: true}
            };

            limitService.loadLimits({limits, errors});

            limitService.limits.should.be.an.Object().with.properties(['staff', 'members']);
            limitService.limits.staff.should.be.an.instanceOf(MaxLimit);
            limitService.limits.members.should.be.an.instanceOf(MaxLimit);
            limitService.isLimited('staff').should.be.true();
            limitService.isLimited('members').should.be.true();
            limitService.isLimited('emails').should.be.true();
        });

        it('can load camel cased limits', function () {
            const limitService = new LimitService();

            const limits = {customThemes: {disabled: true}};

            limitService.loadLimits({limits, errors});

            limitService.limits.should.be.an.Object().with.properties(['customThemes']);
            limitService.limits.customThemes.should.be.an.instanceOf(FlagLimit);
            limitService.isLimited('staff').should.be.false();
            limitService.isLimited('members').should.be.false();
            limitService.isLimited('custom_themes').should.be.true();
            limitService.isLimited('custom-themes').should.be.true();
            limitService.isLimited('customThemes').should.be.true();
        });

        it('can load incorrectly cased limits', function () {
            const limitService = new LimitService();

            const limits = {custom_themes: {disabled: true}, 'custom-integrations': {disabled: true}};

            limitService.loadLimits({limits, errors});

            limitService.limits.should.be.an.Object().with.properties(['customThemes', 'customIntegrations']);
            limitService.limits.customThemes.should.be.an.instanceOf(FlagLimit);
            limitService.isLimited('staff').should.be.false();
            limitService.isLimited('members').should.be.false();
            limitService.isLimited('custom_themes').should.be.true();
            limitService.isLimited('customThemes').should.be.true();
            limitService.isLimited('customIntegrations').should.be.true();
        });

        it('answers correctly when no limits are provided', function () {
            const limitService = new LimitService();

            const limits = {};

            limitService.loadLimits({limits, errors});

            limitService.isLimited('staff').should.be.false();
            limitService.isLimited('members').should.be.false();
            limitService.isLimited('custom_themes').should.be.false();
            limitService.isLimited('customThemes').should.be.false();
            limitService.isLimited('emails').should.be.false();
        });

        it('populates new limits if called multiple times', function () {
            const limitService = new LimitService();

            const staffLimit = {staff: {max: 2}};

            limitService.loadLimits({limits: staffLimit, errors});

            limitService.limits.should.be.an.Object().with.properties(['staff']);
            limitService.limits.staff.should.be.an.instanceOf(MaxLimit);
            limitService.isLimited('staff').should.be.true();
            limitService.isLimited('members').should.be.false();

            const membersLimit = {members: {max: 3}};

            limitService.loadLimits({limits: membersLimit, errors});

            limitService.limits.should.be.an.Object().with.properties(['members']);
            limitService.limits.members.should.be.an.instanceOf(MaxLimit);
            limitService.isLimited('staff').should.be.false();
            limitService.isLimited('members').should.be.true();
        });
    });

    describe('Custom limit count query configuration', function () {
        it('can use a custom implementation of max limit query', async function () {
            const limitService = new LimitService();

            const limits = {
                staff: {
                    max: 2,
                    currentCountQuery: async () => 5
                },
                members: {
                    max: 100,
                    currentCountQuery: async () => 100
                }
            };

            limitService.loadLimits({limits, errors});

            should.equal(await limitService.checkIsOverLimit('staff'), true);
            should.equal(await limitService.checkWouldGoOverLimit('staff'), true);

            should.equal(await limitService.checkIsOverLimit('members'), false);
            should.equal(await limitService.checkWouldGoOverLimit('members'), true);
        });
    });

    describe('Check if any of configured limits are acceded', function () {
        it('Confirms an acceded limit', async function () {
            const limitService = new LimitService();

            const limits = {
                staff: {
                    max: 2,
                    currentCountQuery: async () => 5
                },
                members: {
                    max: 100,
                    currentCountQuery: async () => 100
                },
                emails: {
                    maxPeriodic: 3,
                    currentCountQuery: async () => 5
                },
                customIntegrations: {
                    disabled: true
                }
            };

            const subscription = {
                interval: 'month' as const,
                startDate: '2021-09-18T19:00:52Z'
            };

            limitService.loadLimits({limits, errors, subscription});

            (await limitService.checkIfAnyOverLimit()).should.be.true();
        });

        it('Does not confirm if no limits are acceded', async function () {
            const limitService = new LimitService();

            const limits = {
                staff: {
                    max: 2,
                    currentCountQuery: async () => 1
                },
                members: {
                    max: 100,
                    currentCountQuery: async () => 2
                },
                emails: {
                    maxPeriodic: 3,
                    currentCountQuery: async () => 2
                },
                // TODO: allowlist type of limits doesn't have "checkIsOverLimit" implemented yet!
                // customThemes: {
                //     allowlist: ['casper', 'dawn', 'lyra']
                // },
                // NOTE: the flag limit has flawed assumption of not being acceded previously
                //       this test might fail when the flaw is addressed
                customIntegrations: {
                    disabled: true
                }
            };

            const subscription = {
                interval: 'month' as const,
                startDate: '2021-09-18T19:00:52Z'
            };

            limitService.loadLimits({limits, errors, subscription});

            (await limitService.checkIfAnyOverLimit()).should.be.false();
        });

        it('Returns nothing if limit is not configured', async function () {
            const limitService = new LimitService();

            const isOverLimitResult = await limitService.checkIsOverLimit('unlimited');
            should.equal(isOverLimitResult, undefined);

            const wouldGoOverLimitResult = await limitService.checkWouldGoOverLimit('unlimited');
            should.equal(wouldGoOverLimitResult, undefined);

            const errorIfIsOverLimitResult = await limitService.errorIfIsOverLimit('unlimited');
            should.equal(errorIfIsOverLimitResult, undefined);

            const errorIfWouldGoOverLimitResult = await limitService.errorIfWouldGoOverLimit('unlimited');
            should.equal(errorIfWouldGoOverLimitResult, undefined);
        });

        it('Throws an error when an allowlist limit is checked', async function () {
            const limitService = new LimitService();

            const limits = {
                // TODO: allowlist type of limits doesn't have "checkIsOverLimit" implemented yet!
                customThemes: {
                    allowlist: ['casper', 'dawn', 'lyra']
                }
            };

            limitService.loadLimits({limits, errors});

            try {
                await limitService.checkIfAnyOverLimit();
                should.fail(limitService, 'Should have errored');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
                err.message.should.eql(`Attempted to check an allowlist limit without a value`);
            }
        });
    });

    describe('Metadata', function () {
        afterEach(function () {
            sinon.restore();
        });

        it('passes options for checkIsOverLimit', async function () {
            const limitService = new LimitService();

            const limits = {
                staff: {
                    max: 2,
                    currentCountQuery: async () => 1
                }
            };

            const maxSpy = sinon.spy(MaxLimit.prototype, 'errorIfIsOverLimit');

            const subscription = {
                interval: 'month' as const,
                startDate: '2021-09-18T19:00:52Z'
            };

            limitService.loadLimits({limits, errors, subscription});

            const options = {
                transacting: {}
            };

            await limitService.checkIsOverLimit('staff', options);

            sinon.assert.callCount(maxSpy, 1);
            sinon.assert.alwaysCalledWithExactly(maxSpy, options);
        });

        it('passes options for checkWouldGoOverLimit', async function () {
            const limitService = new LimitService();

            const limits = {
                staff: {
                    max: 2,
                    currentCountQuery: async () => 1
                }
            };

            const maxSpy = sinon.spy(MaxLimit.prototype, 'errorIfWouldGoOverLimit');

            const subscription = {
                interval: 'month' as const,
                startDate: '2021-09-18T19:00:52Z'
            };

            limitService.loadLimits({limits, errors, subscription});

            const options = {
                transacting: {}
            };

            await limitService.checkWouldGoOverLimit('staff', options);

            sinon.assert.callCount(maxSpy, 1);
            sinon.assert.alwaysCalledWithExactly(maxSpy, options);
        });

        it('passes options for errorIfIsOverLimit', async function () {
            const limitService = new LimitService();

            const limits = {
                staff: {
                    max: 2,
                    currentCountQuery: async () => 1
                }
            };

            const maxSpy = sinon.spy(MaxLimit.prototype, 'errorIfIsOverLimit');

            const subscription = {
                interval: 'month' as const,
                startDate: '2021-09-18T19:00:52Z'
            };

            limitService.loadLimits({limits, errors, subscription});

            const options = {
                transacting: {}
            };

            await limitService.errorIfIsOverLimit('staff', options);

            sinon.assert.callCount(maxSpy, 1);
            sinon.assert.alwaysCalledWithExactly(maxSpy, options);
        });

        it('passes options for errorIfWouldGoOverLimit', async function () {
            const limitService = new LimitService();

            const limits = {
                staff: {
                    max: 2,
                    currentCountQuery: async () => 1
                }
            };

            const maxSpy = sinon.spy(MaxLimit.prototype, 'errorIfWouldGoOverLimit');

            const subscription = {
                interval: 'month' as const,
                startDate: '2021-09-18T19:00:52Z'
            };

            limitService.loadLimits({limits, errors, subscription});

            const options = {
                transacting: {}
            };

            await limitService.errorIfWouldGoOverLimit('staff', options);

            sinon.assert.callCount(maxSpy, 1);
            sinon.assert.alwaysCalledWithExactly(maxSpy, options);
        });

        it('passes options for checkIfAnyOverLimit', async function () {
            const limitService = new LimitService();

            const limits = {
                staff: {
                    max: 2,
                    currentCountQuery: async () => 2
                },
                members: {
                    max: 100,
                    currentCountQuery: async () => 100
                },
                emails: {
                    maxPeriodic: 3,
                    currentCountQuery: async () => 3
                },
                customIntegrations: {
                    disabled: true
                }
            };

            const flagSpy = sinon.spy(FlagLimit.prototype, 'errorIfIsOverLimit');
            const maxSpy = sinon.spy(MaxLimit.prototype, 'errorIfIsOverLimit');
            const maxPeriodSpy = sinon.spy(MaxPeriodicLimit.prototype, 'errorIfIsOverLimit');

            const subscription = {
                interval: 'month' as const,
                startDate: '2021-09-18T19:00:52Z'
            };

            limitService.loadLimits({limits, errors, subscription});

            const options = {
                transacting: {}
            };

            (await limitService.checkIfAnyOverLimit(options)).should.be.false();

            sinon.assert.callCount(flagSpy, 1);
            sinon.assert.alwaysCalledWithExactly(flagSpy, options);

            sinon.assert.callCount(maxSpy, 2);
            sinon.assert.alwaysCalledWithExactly(maxSpy, options);

            sinon.assert.callCount(maxPeriodSpy, 1);
            sinon.assert.alwaysCalledWithExactly(maxPeriodSpy, options);
        });
    });
});