package com.campusmarket.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * The pools that out-of-band delivery runs on.
 *
 * <p>Sending to FCM is a network call to someone else's service, and it happens
 * on the tail of ordinary requests - placing an order, sending a message. None
 * of those should wait on it, and none of them should fail because Google is
 * slow, so the send is handed to this executor after the transaction commits.
 *
 * <p>The queue is bounded and the rejection policy is caller-runs: under a flood
 * the worst case is that a request pays for its own push rather than the app
 * silently dropping notifications or the queue growing until the heap gives out.
 */
@Configuration
@EnableAsync
@Slf4j
public class AsyncConfig {

    public static final String PUSH_EXECUTOR = "pushExecutor";

    @Bean(PUSH_EXECUTOR)
    public Executor pushExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(500);
        executor.setThreadNamePrefix("push-");
        executor.setRejectedExecutionHandler(new java.util.concurrent.ThreadPoolExecutor.CallerRunsPolicy());
        // Let in-flight sends finish on shutdown; a dropped push is a user-visible
        // gap, and the wait is capped so it cannot hold a deploy open.
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(10);
        executor.initialize();
        return executor;
    }

    public static final String MAIL_EXECUTOR = "mailExecutor";

    /**
     * Notification email. Separate pool from push, not a shared one.
     *
     * <p>SMTP is an order of magnitude slower than an FCM call and a shared
     * queue would let a slow mail provider starve push delivery of threads -
     * the failure would show up as notifications not arriving on phones, with
     * nothing about mail in the symptom.
     *
     * <p>Single-threaded core with a small maximum on purpose: providers
     * rate-limit per connection, and answering a burst by opening eight
     * connections is how an account gets throttled or flagged.
     */
    @Bean(MAIL_EXECUTOR)
    public Executor mailExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(1000);
        executor.setThreadNamePrefix("mail-");
        executor.setRejectedExecutionHandler(new java.util.concurrent.ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(20);
        executor.initialize();
        return executor;
    }

    public static final String CAMPAIGN_EXECUTOR = "campaignExecutor";

    /**
     * Campaign sends, which are long-running by nature - one task can hold a
     * thread for minutes while it paces through an audience.
     *
     * <p>Strictly one at a time, and that is the point: two concurrent
     * campaigns would interleave against the same provider rate limit and each
     * would look like the other's failure. A second campaign queues behind the
     * first instead.
     *
     * <p>waitForTasksToCompleteOnShutdown is false here, unlike the pools
     * above. A half-finished campaign cannot be resumed, so holding a deploy
     * open for several minutes to let one finish buys nothing a restart would
     * not also leave broken - the row is left SENDING either way and has to be
     * judged by hand.
     */
    @Bean(CAMPAIGN_EXECUTOR)
    public Executor campaignExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setQueueCapacity(20);
        executor.setThreadNamePrefix("campaign-");
        executor.setRejectedExecutionHandler(new java.util.concurrent.ThreadPoolExecutor.AbortPolicy());
        executor.initialize();
        return executor;
    }
}
