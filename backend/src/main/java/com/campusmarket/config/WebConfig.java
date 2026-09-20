package com.campusmarket.config;

import com.campusmarket.security.PrincipalArgumentResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.core.Ordered;
import org.springframework.http.CacheControl;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.List;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class WebConfig implements WebMvcConfigurer {

    private final PrincipalArgumentResolver principalArgumentResolver;
    private final AppProperties properties;

    @Value("${campusmarket.uploads-dir}")
    private String uploadsDir;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(principalArgumentResolver);
    }

    /**
     * The allowlist as configured, minus the two things people get wrong when
     * typing one into an environment variable: stray whitespace around the
     * commas, and a trailing slash. Neither survives a string comparison
     * against a browser's {@code Origin} header, which is always scheme, host
     * and port and nothing else.
     *
     * <p>No hardcoded fallback. application.yml holds the default, and an
     * explicitly empty list means the operator allowed nothing - silently
     * substituting a built-in list there would be a surprising way to
     * re-open access someone had deliberately closed.
     */
    private List<String> resolveOrigins() {
        List<String> raw = properties.getCorsOrigins();
        if (raw == null) {
            return List.of();
        }
        return raw.stream()
                .map(String::trim)
                .map(s -> s.replaceAll("/+$", ""))
                .filter(s -> !s.isEmpty())
                .toList();
    }

    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilterRegistrationBean() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        CorsConfiguration config = new CorsConfiguration();

        List<String> origins = resolveOrigins();

        /*
         * Logged because a CORS failure is invisible from the server side: the
         * request succeeds, the response is correct, and the browser discards
         * it without telling anyone but the console of whoever is looking. One
         * line on startup turns "the frontend cannot reach the API" from a
         * guessing game into a comparison.
         */
        if (origins.isEmpty()) {
            log.warn("CORS allowlist is empty - every cross-origin browser request will be rejected. "
                    + "Set CAMPUSMARKET_CORS_ORIGINS to the origin serving the frontend.");
        } else {
            log.info("CORS allowlist: {}", origins);
        }

        config.setAllowedOriginPatterns(origins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        source.registerCorsConfiguration("/**", config);

        FilterRegistrationBean<CorsFilter> bean = new FilterRegistrationBean<>(new CorsFilter(source));
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return bean;
    }

    /*
     * There is deliberately no addCorsMappings override to go with the filter
     * above.
     *
     * Spring MVC's CORS support and a CorsFilter are two implementations of
     * the same thing, and the filter is registered at HIGHEST_PRECEDENCE, so
     * it answers every preflight before a handler is ever looked up. The MVC
     * mapping never got to make a decision - Spring's processor sees the
     * Access-Control-Allow-Origin header already on the response and returns
     * early. It was a second copy of the policy that could drift from the
     * first without any symptom to reveal it.
     *
     * The filter is also the one that covers the static resource handler
     * below, which is why it is the copy that was kept.
     */

    /**
     * Serves what {@link com.campusmarket.service.ImageStorageService} writes.
     *
     * <p>Under {@code /api/**} so it rides the same dev proxy and CORS mapping
     * as everything else rather than needing its own. Cached for a year: every
     * filename is a random UUID minted once and never reused for different
     * bytes, so there is no staleness to guard against - a URL either has not
     * been written yet or will never change again.
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path root = Paths.get(uploadsDir).toAbsolutePath().normalize();
        try {
            // Created here too, not only in ImageStorageService: bean init order
            // between the two is not guaranteed, and toUri() below needs the
            // directory to already exist to reliably produce a trailing slash.
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not create the uploads directory: " + root, e);
        }
        registry.addResourceHandler("/api/uploads/**")
                .addResourceLocations(root.toUri().toString())
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
    }
}
