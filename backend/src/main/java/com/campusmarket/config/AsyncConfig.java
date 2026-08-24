package com.campusmarket.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * The pool that push delivery runs on.
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
}
