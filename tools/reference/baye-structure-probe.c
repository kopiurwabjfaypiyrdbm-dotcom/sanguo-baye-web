#include "baye/attribute.h"

#include <stddef.h>
#include <stdio.h>

#define FIELD(type, name) {#name, offsetof(type, name), sizeof(((type *)0)->name)}

typedef struct {
    const char *name;
    size_t offset;
    size_t size;
} FieldLayout;

static const FieldLayout person_fields[] = {
    FIELD(PersonType, OldBelong), FIELD(PersonType, Belong), FIELD(PersonType, Level),
    FIELD(PersonType, Force), FIELD(PersonType, IQ), FIELD(PersonType, Devotion),
    FIELD(PersonType, Character), FIELD(PersonType, Experience), FIELD(PersonType, Thew),
    FIELD(PersonType, ArmsType), FIELD(PersonType, Arms), FIELD(PersonType, Equip), FIELD(PersonType, Age),
};

static const FieldLayout city_fields[] = {
    FIELD(CityType, State), FIELD(CityType, Belong), FIELD(CityType, SatrapId),
    FIELD(CityType, FarmingLimit), FIELD(CityType, Farming), FIELD(CityType, CommerceLimit),
    FIELD(CityType, Commerce), FIELD(CityType, PeopleDevotion), FIELD(CityType, AvoidCalamity),
    FIELD(CityType, PopulationLimit), FIELD(CityType, Population), FIELD(CityType, Money),
    FIELD(CityType, Food), FIELD(CityType, MothballArms), FIELD(CityType, PersonQueue),
    FIELD(CityType, Persons), FIELD(CityType, ToolQueue), FIELD(CityType, Tools),
};

static const FieldLayout goods_fields[] = {
    FIELD(GOODS, idx_), FIELD(GOODS, useflag), FIELD(GOODS, atRange),
    FIELD(GOODS, changeAttackRange), FIELD(GOODS, reserved), FIELD(GOODS, at),
    FIELD(GOODS, iq), FIELD(GOODS, move), FIELD(GOODS, arm),
};

static void print_layout(const char *name, size_t size, const FieldLayout *fields, size_t count) {
    printf("\"%s\":{\"size\":%zu,\"fields\":[", name, size);
    for (size_t index = 0; index < count; index++) {
        if (index) printf(",");
        printf("{\"name\":\"%s\",\"offset\":%zu,\"size\":%zu}",
               fields[index].name, fields[index].offset, fields[index].size);
    }
    printf("]}");
}

int main(void) {
    printf("{");
    print_layout("PersonType", sizeof(PersonType), person_fields, sizeof(person_fields) / sizeof(person_fields[0]));
    printf(",");
    print_layout("CityType", sizeof(CityType), city_fields, sizeof(city_fields) / sizeof(city_fields[0]));
    printf(",");
    print_layout("GOODS", sizeof(GOODS), goods_fields, sizeof(goods_fields) / sizeof(goods_fields[0]));
    printf("}\n");
    return 0;
}
