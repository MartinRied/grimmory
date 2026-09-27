package org.booklore.mapper.custom;

import org.booklore.mapper.LibraryMapper;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.entity.BookLoreUserEntity;
import org.booklore.model.entity.UserSettingEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.ObjectMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(MockitoExtension.class)
class BookLoreUserTransformerTest {

    @Mock
    private LibraryMapper libraryMapper;

    private BookLoreUserTransformer transformer;

    @BeforeEach
    void setUp() {
        transformer = new BookLoreUserTransformer(new ObjectMapper(), libraryMapper);
    }

    @Test
    void toDTO_deserializesColumnsOnGlobalAndOverridePreferences() {
        String entityViewPreferencesJson = """
                {
                  "global": {
                    "sortKey": "title",
                    "sortDir": "ASC",
                    "view": "TABLE",
                    "columns": ["title", "authors", "seriesName"]
                  },
                  "overrides": [
                    {
                      "entityType": "LIBRARY",
                      "entityId": 1,
                      "preferences": {
                        "sortKey": "addedOn",
                        "sortDir": "DESC",
                        "columns": ["title", "publisher"]
                      }
                    }
                  ]
                }
                """;
        BookLoreUserEntity userEntity = userEntityWithSetting("entityViewPreferences", entityViewPreferencesJson);

        BookLoreUser result = transformer.toDTO(userEntity);

        BookLoreUser.UserSettings.EntityViewPreferences prefs = result.getUserSettings().getEntityViewPreferences();
        assertThat(prefs.getGlobal().getColumns()).containsExactly("title", "authors", "seriesName");
        assertThat(prefs.getOverrides()).hasSize(1);
        assertThat(prefs.getOverrides().getFirst().getPreferences().getColumns()).containsExactly("title", "publisher");
        assertThat(prefs.getOverrides().getFirst().getPreferences().getView()).isNull();
    }

    @Test
    void toDTO_missingColumnsField_deserializesAsNull() {
        String entityViewPreferencesJson = """
                {
                  "global": {
                    "sortKey": "title",
                    "sortDir": "ASC",
                    "view": "GRID"
                  },
                  "overrides": []
                }
                """;
        BookLoreUserEntity userEntity = userEntityWithSetting("entityViewPreferences", entityViewPreferencesJson);

        BookLoreUser result = transformer.toDTO(userEntity);

        assertThat(result.getUserSettings().getEntityViewPreferences().getGlobal().getColumns()).isNull();
    }

    private BookLoreUserEntity userEntityWithSetting(String key, String value) {
        BookLoreUserEntity userEntity = BookLoreUserEntity.builder().isDefaultPassword(false).build();
        UserSettingEntity setting = new UserSettingEntity();
        setting.setSettingKey(key);
        setting.setSettingValue(value);
        userEntity.setSettings(new java.util.HashSet<>(List.of(setting)));
        return userEntity;
    }
}
