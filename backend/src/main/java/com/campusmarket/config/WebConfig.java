package com.campusmarket.config;

import com.campusmarket.security.PrincipalArgumentResolver;
import lombok.RequiredArgsConstructor;
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
import org.springframework.web.servlet.config.annotation.CorsRegistry;
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

    private static final List<String> DEFAULT_ORIGINS = List.of(
            "http://localhost:3000",
            "http://localhost:5173",
            "https://salepilot.space",
            "https://www.salepilot.space",
            "https://campusmarket.salepilot.space",
            "https://campus-market-mu.vercel.app",
            "https://www.campus-market-mu.vercel.app"
    );

    private List<String> resolveOrigins() {
        List<String> raw = properties.getCorsOrigins();
        if (raw == null) {
            return DEFAULT_ORIGINS;
        }
        List<String> cleaned = raw.stream()
                .map(String::trim)
                .map(s -> s.replaceAll("/+$", ""))
                .filter(s -> !s.isEmpty())
                .toList();
        return cleaned.isEmpty() ? DEFAULT_ORIGINS : cleaned;
    }

    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilterRegistrationBean() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        CorsConfiguration config = new CorsConfiguration();

        List<String> origins = resolveOrigins();
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

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        List<String> origins = resolveOrigins();
        registry.addMapping("/**")
                .allowedOriginPatterns(origins.toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD")
                .allowedHeaders("*")
                .exposedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600L);
    }

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
